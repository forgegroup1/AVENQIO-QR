import logo from "../assets/avenqio-logo.png";

export function BrandMark({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src={logo} alt="" className={`${className} object-contain`} />;
}
