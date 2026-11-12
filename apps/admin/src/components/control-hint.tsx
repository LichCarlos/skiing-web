"use client";

import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { FormHint } from "@/components/form-hint";
import styles from "@/components/form-hint.module.css";

/** Standalone controls retain their handlers and expose the same rule text as Form.Item. */
export function ControlHint({
  children,
  hint,
  fluid = false,
}: {
  children: ReactElement<{ "aria-describedby"?: string }>;
  hint: ReactNode;
  fluid?: boolean;
}) {
  const id = useId();
  return (
    <div className={fluid ? styles.controlFluid : styles.control}>
      {cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], id]
          .filter(Boolean)
          .join(" "),
      })}
      <FormHint id={id}>{hint}</FormHint>
    </div>
  );
}
