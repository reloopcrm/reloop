import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@crm/ui/lib/utils"

const displayVariants = cva(
  "m-0 font-display tracking-[-0.04em] text-balance",
  {
    variants: {
      size: {
        hero: "text-[length:clamp(2.75rem,min(8.6vw,12svh),7.5rem)] leading-[0.85]",
        section: "text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.88]",
        title: "text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.03em]",
      },
      case: {
        normal: "",
        upper: "uppercase",
      },
      tone: {
        default: "text-foreground",
        inverse: "text-primary-foreground",
      },
    },
    defaultVariants: {
      size: "hero",
      case: "normal",
      tone: "default",
    },
  }
)

function Display({
  className,
  size,
  case: letterCase,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"h1"> &
  VariantProps<typeof displayVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "h1"

  return (
    <Comp
      data-slot="display"
      className={cn(displayVariants({ size, case: letterCase, tone }), className)}
      {...props}
    />
  )
}

export { Display, displayVariants }
