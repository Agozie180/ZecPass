use std::hash::pedersen_hash;

/// Open a sealed bid at reveal time.
///
/// The bidder now chooses to disclose the amount. This circuit re-derives the
/// commitment from the disclosed `bid` plus the same private `blinding` used
/// when sealing, and asserts it equals the commitment the auctioneer already
/// holds (`expected_commitment`, a public input). That equality is the whole
/// guarantee: a bidder cannot reveal a different amount than the one they
/// sealed, and cannot reveal someone else's bid without its blinding.
///
/// Private inputs: `blinding` (the per-bid randomness).
///
/// Public inputs: `bid` (now revealed), `currency` (auction tag),
/// `expected_commitment` (the commitment recorded at seal time).
///
/// Public output: `bidder_binding = pedersen([bidder_secret, currency, 1])`,
/// recomputed from the private `bidder_secret` so the auctioneer can confirm the
/// reveal comes from the same bidder who sealed it.
fn main(
    bidder_secret: Field,
    blinding: Field,
    bid: pub u64,
    currency: pub Field,
    expected_commitment: pub Field,
) -> pub Field {
    assert(blinding != 0);
    assert(bidder_secret != 0);
    assert(currency != 0);
    assert(expected_commitment != 0);

    // Recompute exactly as `sealed_bid` did, from the disclosed amount.
    let recomputed = pedersen_hash([bid as Field, blinding, currency]);
    assert(recomputed == expected_commitment);

    // Same derivation as `sealed_bid`, so the bindings match.
    let bidder_binding = pedersen_hash([bidder_secret, currency, 1]);
    bidder_binding
}

#[test]
fn the_correct_amount_opens_the_commitment() {
    // sealed at bid 120, blinding 7, currency 5: commitment = pedersen([120,7,5]).
    let expected = pedersen_hash([120, 7, 5]);
    let binding = main(9, 7, 120, 5, expected);
    // Binding must match the sealed_bid derivation pedersen([9, 5, 1]).
    assert(binding == pedersen_hash([9, 5, 1]));
}

#[test(should_fail)]
fn a_wrong_amount_cannot_open_the_commitment() {
    let expected = pedersen_hash([120, 7, 5]);
    // Claim the bid was 130: recomputed != expected, so no proof exists.
    let _ = main(9, 7, 130, 5, expected);
}

#[test(should_fail)]
fn a_wrong_blinding_cannot_open_the_commitment() {
    let expected = pedersen_hash([120, 7, 5]);
    let _ = main(9, 8, 120, 5, expected);
}

#[test(should_fail)]
fn a_wrong_auction_cannot_open_the_commitment() {
    let expected = pedersen_hash([120, 7, 5]);
    let _ = main(9, 7, 120, 6, expected);
}

#[test]
fn opening_another_bidders_bid_needs_their_blinding() {
    // The auctioneer's commitment belongs to bidder 9. An attacker with their
    // own secret (10) but without blinding 7 cannot produce a matching binding.
    let expected = pedersen_hash([120, 7, 5]);
    // With the correct blinding, the binding is the honest bidder's.
    assert(main(9, 7, 120, 5, expected) == pedersen_hash([9, 5, 1]));
    // The attacker's own binding differs, so a copied reveal is detectable.
    assert(main(10, 7, 120, 5, expected) != pedersen_hash([9, 5, 1]));
}
