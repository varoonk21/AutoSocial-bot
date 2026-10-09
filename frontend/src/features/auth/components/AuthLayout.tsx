import { ReactNode } from "react";

function getCurrentYear() {
  return new Date().getFullYear();
}

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full relative bg-white text-neutral-900 selection:bg-blue-100 selection:text-blue-900 antialiased">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(45deg, transparent 49%, #e5e7eb 49%, #e5e7eb 51%, transparent 51%),
            linear-gradient(-45deg, transparent 49%, #e5e7eb 49%, #e5e7eb 51%, transparent 51%)
          `,
          backgroundSize: "50px 50px",
          WebkitMaskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, #000 30%, transparent 80%)",
          maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, #000 30%, transparent 80%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen w-full">
        <div className="hidden w-1/2 flex-col justify-between p-12 md:flex">
          <div className="flex items-start justify-center flex-col  font-bold tracking-tight text-3xl text-neutral-900">
            <img src="/Icon.png" alt="AutoSocial Icon" className="w-20 h-20 object-contain rounded-lg" />
            <span>AutoSocial</span>
          </div>

          <div className="max-w-lg mb-20">
            <h1 className="mb-6 text-5xl font-semibold tracking-tight leading-tight text-neutral-900">
              Unlock limitless <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 font-semibold">content.</span>
            </h1>
            <p className="text-lg text-neutral-500 font-normal leading-relaxed">
              Turn ideas into posts with an AI partner that understands context, tone, and brand voice. The smartest way to write, schedule, and grow
              is right here.
            </p>
          </div>

          <div className="text-xs text-neutral-400 font-normal">&copy; {getCurrentYear()} AutoSocial Inc. All rights reserved.</div>
        </div>

        <div className="flex w-full flex-col items-center justify-center p-4 md:w-1/2">
          <div className="md:hidden flex flex-col items-center mb-8 text-center space-y-2">
            <div className="flex items-center gap-3 font-bold tracking-tight text-3xl text-neutral-900">
              <img src="/Icon.png" alt="AutoSocial Icon" className="w-20 h-20 object-contain rounded-lg" />
              <span>AutoSocial</span>
            </div>
            <p className="text-sm text-neutral-500 font-normal">Turn ideas into posts with an AI partner.</p>
          </div>

          {children}

          <div className="md:hidden mt-8 text-xs text-neutral-400 font-normal">&copy; {getCurrentYear()} AutoSocial Inc.</div>
        </div>
      </div>
    </div>
  );
}
