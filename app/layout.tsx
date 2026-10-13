import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import "./board.css";
import { ThemeToggle } from "@/components/theme-toggle";

const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "ZecPass | The price is public. The bidders are not.",
  description:
    "ZecPass runs sealed-bid auctions on Zcash. Bids are proved in the bidder's browser and delivered in shielded memos, so the price stays sealed. Powered by Noir and UltraHonk.",
};

// Set the chosen theme before paint so an opted-in dark user never sees a light
// flash. Light is the default: the attribute is only added when dark was chosen.
const themeScript =
  "(function(){try{if(localStorage.getItem('zecpass.theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
