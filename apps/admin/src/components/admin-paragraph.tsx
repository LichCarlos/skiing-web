"use client";

import type { ComponentProps } from "react";
import { Typography } from "antd";
import styles from "@/components/form-hint.module.css";

/** Retain paragraph semantics and existing layout; Ant Design owns descriptive text. */
export function AdminParagraph({ children, ...props }: ComponentProps<"p">) {
  return (
    <p {...props}>
      <Typography.Text className={styles.paragraphText}>
        {children}
      </Typography.Text>
    </p>
  );
}
