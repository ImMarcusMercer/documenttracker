import { useEffect } from "react";

export function useUnsavedChanges(shouldWarn, message = "You have unsaved changes. Leave this page?") {
  useEffect(() => {
    const beforeUnload = (event) => {
      if (!shouldWarn) return;
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [shouldWarn, message]);
}
