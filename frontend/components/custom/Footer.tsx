import { Play , ShieldCheck } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart } from "@fortawesome/free-solid-svg-icons";

const resources = [
  "Shadcn studio PRO",
  "Shadcn studio Figma",
  "Shadcn studio Blocks",
  "Shadcn studio Templates",
  "Shadcn studio Builder",
];

const helpAndSupport = [
  "Support",
  "Affiliation Program",
  "FAQs",
  "Discord Community",
  "Blog",
  "About Us",
  "Contact Us",
  "Hire Us",
];

const legal = [
  "License",
  "Privacy policy",
  "Terms & Condition",
  "Brand Guideline",
];

function FooterColumn({ title , links } : {title : string , links : string[]}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-3">
        {links.map((link : string) => (
          <li key={link}>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialIcon({ children, href = "#" }) {
  return (
    <a
      href={href}
      className="text-muted-foreground hover:text-foreground transition-colors duration-200"
    >
      {children}
    </a>
  );
}

function ProductLogo({ name, color, children }) {
  return (
    <span
      className="text-sm font-bold tracking-tight"
      style={{ color }}
    >
      {children || name}
    </span>
  );
}

export default function Footer() {
  return (
    <footer className="bg-background border-t border-border w-full">
      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand Column */}
          <div className="flex flex-col gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-4 h-4 text-background"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="font-semibold text-base text-foreground">
                shadcn/studio
              </span>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              An open-source collection of copy-and-paste shadcn/ui components,
              blocks, and templates - paired with a powerful Shadcn theme
              generator to craft, customize, and ship faster.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-4">
              {/* <SocialIcon>
                <Github className="w-5 h-5" />
              </SocialIcon>
              <SocialIcon>
                <Instagram className="w-5 h-5" />
              </SocialIcon>
              <SocialIcon>
                <Twitter className="w-5 h-5" />
              </SocialIcon>
              <SocialIcon>
                <Youtube className="w-5 h-5" />
              </SocialIcon> */}
            </div>

            <Separator />

            {/* Extra links */}
            <div className="flex flex-col gap-3">
              <a
                href="#"
                className="text-sm text-foreground hover:text-muted-foreground transition-colors duration-200 font-medium"
              >
                Roadmap
              </a>
              <a
                href="#"
                className="text-sm text-foreground hover:text-muted-foreground transition-colors duration-200 font-medium"
              >
                Changelog
              </a>
            </div>
          </div>

          {/* Resources */}
          <FooterColumn title="Resources" links={resources} />

          {/* Help and Support */}
          <FooterColumn title="Help and Support" links={helpAndSupport} />

          {/* Legal */}
          <FooterColumn title="Legal" links={legal} />
        </div>
      </div>


      {/* Bottom Bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground flex items-center">
            ©2026 D2C. Made with &nbsp;  <FontAwesomeIcon icon={faHeart} className="w-4 text-muted-foreground" /> &nbsp;
            for better web.
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {/* Secure Payment */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <span>Secure Payment</span>
            </div>
           
            {/* Payment logos */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-blue-700 font-extrabold px-2 py-0.5 text-xs border-blue-200">
                VISA
              </Badge>

              <div className="flex">
                <div className="w-5 h-5 rounded-full bg-red-500 opacity-90" />
                <div className="w-5 h-5 rounded-full bg-orange-400 opacity-90 -ml-2" />
              </div>
            </div>
          </div>
        </div>
      </div>

    </footer>
  );
}