import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-2 border-[#1E293B] px-3 py-0.5 text-xs font-head font-bold shadow-[2px_2px_0_#1E293B] transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#F5C842] text-[#1E293B]",
        secondary:
          "bg-[#5B9BD5] text-white",
        destructive:
          "bg-[#FF6B5E] text-white",
        outline: "bg-white text-[#1E293B]",
        accent: "bg-[#4CAF7D] text-white",
        purple: "bg-[#9B7EDE] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
