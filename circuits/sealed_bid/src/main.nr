use std::hash::pedersen_hash;

/// Sealed bid: prove a bid is admissible without revealing it.
///
/// The auctioneer publishes `currency` (binds the commitment to one auction),
/// bounds the bid between `min_reserve` (a public floor lower bound) and
/// `max_bound` (a public upper bound), and asks nothing else. The bidder proves
/// `min_reserve <= bid <= max_bound` in zero knowledge, so the price stays
/// sealed while the auctioneer knows the bid is well-formed and one-per-bidder.
///
/// Private inputs: `bid` (the amount), `blinding` (per-bid randomness that makes
/// the commitment hiding), `bidder_secret` (the bidder's stable secret).
///
/// Public inputs: `currency` (auction/price-token tag), `min_reserve`,
/// `max_bound`.
///
/// Public outputs: `bid_commitment = pedersen([bid, blinding, currency])`,
/// `bidder_binding = pedersen([bidder_secret, currency, 1])`,
/// `nullifier = pedersen([bidder_secret, currency, 2])`.
///
/// The commitment is binding and hiding: a passing proof shows a well-formed,
/// in-range bid exists, but only the opener (see `open_bid`) can reveal it. The
/// nullifier is derived here so a bidder cannot forge a second admissible bid
/// for the same auction, and it carries no information about the amount.
fn main(
    bid: u64,
    blinding: Field,
    bidder_secret: Field,
    currency: pub Field,
    min_reserve: pub u64,
    max_bound: pub u64,
) -> pub (Field, Field, Field) {
    // The two public bounds must describe a real interval.
    assert(min_reserve <= max_bound);
    assert(min_reserve > 0);

    // The bid itself never leaves the witness, so its range is asserted here.
    // Both comparisons are the whole point: an out-of-range bid is unsatisfiable.
    assert(bid >= min_reserve);
    assert(bid <= max_bound);

    // Non-zero witnesses keep every output an opaque, non-trivial field element.
    assert(blinding != 0);
    assert(bidder_secret != 0);
    assert(currency != 0);

    let bid_commitment = pedersen_hash([bid as Field, blinding, currency]);
    // Domain-separated: 1 = bidder binding, 2 = per-auction nullifier.
    let bidder_binding = pedersen_hash([bidder_secret, currency, 1]);
    let nullifier = pedersen_hash([bidder_secret, currency, 2]);

    (bid_commitment, bidder_binding, nullifier)
}

#[test]
fn an_in_range_bid_is_admissible() {
    let (commitment, binding, nullifier) = main(120, 7, 9, 5, 100, 150);
    assert(commitment != binding);
    assert(binding != nullifier);
    assert(commitment != nullifier);
}

#[test]
fn the_bounds_are_inclusive() {
    // Exactly at the floor and exactly at the ceiling must both hold.
    let _ = main(100, 7, 9, 5, 100, 150);
    let _ = main(150, 7, 9, 5, 100, 150);
}

#[test(should_fail)]
fn a_bid_below_the_reserve_cannot_prove() {
    let _ = main(99, 7, 9, 5, 100, 150);
}

#[test(should_fail)]
fn a_bid_above_the_bound_cannot_prove() {
    let _ = main(151, 7, 9, 5, 100, 150);
}

#[test(should_fail)]
fn a_broken_interval_cannot_prove() {
    let _ = main(120, 7, 9, 5, 200, 150);
}

#[test]
fn the_commitment_is_deterministic_per_bid_and_blinding() {
    let (c1, _, _) = main(120, 7, 9, 5, 100, 150);
    let (c2, _, _) = main(120, 7, 9, 5, 100, 150);
    assert(c1 == c2);
    // Different bid => different commitment.
    let (c3, _, _) = main(121, 7, 9, 5, 100, 150);
    assert(c3 != c1);
    // Different blinding => different commitment (hiding).
    let (c4, _, _) = main(120, 8, 9, 5, 100, 150);
    assert(c4 != c1);
    // Different auction/currency => different commitment.
    let (c5, _, _) = main(120, 7, 9, 6, 100, 150);
    assert(c5 != c1);
}

#[test]
fn the_nullifier_is_per_bidder_and_per_auction() {
    let (_, b1, n1) = main(120, 7, 9, 5, 100, 150);
    // Same bidder, same auction, different amount: binding and nullifier stay.
    let (_, b2, n2) = main(130, 8, 9, 5, 100, 150);
    assert(b1 == b2);
    assert(n1 == n2);
    // Different auction: both change.
    let (_, b3, n3) = main(120, 7, 9, 6, 100, 150);
    assert(b3 != b1);
    assert(n3 != n1);
    // Different bidder: both change.
    let (_, b4, n4) = main(120, 7, 10, 5, 100, 150);
    assert(b4 != b1);
    assert(n4 != n1);
}
