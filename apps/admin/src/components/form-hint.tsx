"use client";

import type { ReactNode } from "react";
import { Typography } from "antd";
import styles from "@/components/form-hint.module.css";

export function FormHint({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <Typography.Text id={id} type="secondary" className={styles.hint}>
      {children}
    </Typography.Text>
  );
}
