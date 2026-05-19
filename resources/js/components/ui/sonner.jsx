import { Toaster as SonnerToaster } from "sonner";

export function Toaster(props) {
  return (
    <SonnerToaster
      position="bottom-left"
      duration={5000}
      visibleToasts={6}
      expand
      closeButton
      richColors
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "min-w-[340px] max-w-[460px] rounded-xl border shadow-2xl px-4 py-4 text-sm font-medium",
          title: "text-sm font-semibold",
          description: "text-sm leading-relaxed",
          success: "border-emerald-200 bg-emerald-50 text-emerald-950",
          error: "border-red-200 bg-red-50 text-red-950",
          warning: "border-amber-200 bg-amber-50 text-amber-950",
          info: "border-sky-200 bg-sky-50 text-sky-950",
        },
      }}
      {...props}
    />
  );
}
