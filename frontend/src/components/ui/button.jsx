import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-head font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C842] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-x-[2px] active:translate-y-[2px]",
  {
    variants: {
      variant: {
        default:
          "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#E6B935] active:shadow-none",
        destructive:
          "bg-[#E04A3C] !text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#C93B2E] active:shadow-none",
        outline:
          "bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#FFF9E8] active:shadow-none",
        secondary:
          "bg-[#3E7CB1] !text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#336894] active:shadow-none",
        accent:
          "bg-[#2F8A5F] !text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#26734E] active:shadow-none",
        purple:
          "bg-[#7A5CC0] !text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#664BA7] active:shadow-none",
        dark:
          "bg-[#1E293B] !text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:bg-[#2A374A] active:shadow-none",
        ghost: "hover:bg-[#F5C842]/20 text-[#1E293B]",
        link: "text-[#1E293B] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-full px-3 text-xs shadow-[2px_2px_0_#1E293B] border-[1.5px]",
        lg: "h-12 rounded-full px-8 text-base shadow-[4px_4px_0_#1E293B]",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
