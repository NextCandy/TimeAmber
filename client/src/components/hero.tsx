import { BrandImage } from "@/components/brand-image";

type HeroProps = {
  siteTitle?: string;
  siteDescription?: string;
  siteTagline?: string;
};

export function Hero({
  siteTitle = "TimeAmber",
  siteDescription = "时光琥珀，一个用文字封存瞬间的个人博客。",
  siteTagline = "时光成珀，字字如初",
}: HeroProps) {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden py-[60px] lg:py-[80px]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-radial from-ring/[0.07] via-foreground/[0.04] to-transparent blur-3xl animate-fade-in" />
      </div>
      <div className="relative mb-[24px] animate-scale-in delay-0">
        <BrandImage
          alt=""
          className="h-[64px] w-[64px] object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.08)]"
          decoding="async"
        />
        <div className="absolute -inset-[8px] rounded-[8px] bg-foreground/[0.03] blur-xl" />
      </div>
      <h1 className="animate-blur-in delay-1 text-center text-[36px] font-semibold leading-tight tracking-[-0.03em] lg:text-[44px]">
        {siteTitle}
      </h1>
      <p className="mt-[12px] max-w-[480px] text-center text-[15px] leading-relaxed text-muted-foreground animate-fade-in-up delay-2">
        {siteDescription}
        <br />
        <span className="text-muted-foreground/60">{siteTagline}</span>
      </p>
    </section>
  );
}
