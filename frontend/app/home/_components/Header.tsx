import Link from "next/link";
import { RainbowButton } from "@/components/ui/rainbow-button";

function ButtonRegister() {
  return (
    <Link href="/auth/signup">
      <RainbowButton className="mt-10 inline-block h-fit w-fit rounded-full text-2xl capitalize outline outline-1 outline-offset-2 outline-foreground">
        <span className="m-5 block">Register to class</span>
      </RainbowButton>
    </Link>
  );
}

export default function Header() {
  return (
    <div className="relative z-50 m-auto flex select-none flex-col text-center text-foreground">
      <h1 className="text-[5rem] leading-none">
        Discover your path towards <br />
        <span>your goals</span>
      </h1>
      <ButtonRegister />
    </div>
  );
}
