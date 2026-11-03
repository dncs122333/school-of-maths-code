import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const ConfirmContext = createContext(null);

// `const ok = await confirm({ title, description, confirmLabel, destructive })` replaces window.confirm,
// which looks out of place on phones and is unreliable inside native app shells.
export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    const o = typeof options === "string" ? { description: options } : options;
    setOpts(o);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(open) => { if (!open) close(false); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-[2.5px] border-[#1E293B] bg-white shadow-[4px_4px_0_#1E293B]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-head text-[#1E293B]">{opts?.title || "Are you sure?"}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription className="text-[#1E293B]/80">{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => close(false)} className="min-h-11 rounded-full border-2 border-[#1E293B]">
              {opts?.cancelLabel || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-dialog-ok"
              onClick={() => close(true)}
              className={`min-h-11 rounded-full border-2 border-[#1E293B] text-white ${
                opts?.destructive ? "bg-[#E04A3C] hover:bg-[#C93E31]" : "bg-[#1E293B] hover:bg-[#334155]"
              }`}
            >
              {opts?.confirmLabel || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
