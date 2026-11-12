import { createTheme } from "@common/theme";
import type { ThemeConfig } from "antd";

export const appTheme = createTheme({
  primary: "#2455f5",
  foreground: "#17264c",
  background: "#ffffff",
  muted: "#eef7ff",
  mutedForeground: "#495e80",
  border: "#cbd9ef",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
});

/** Admin-only component tokens; the public website keeps its own theme. */
export const adminComponentTheme: ThemeConfig = {
  token: {
    colorPrimary: appTheme.primary,
    colorPrimaryHover: "#183dc2",
    colorPrimaryActive: "#122f98",
    colorPrimaryBg: "#e5efff",
    colorPrimaryBgHover: "#d9e8ff",
    colorPrimaryText: appTheme.primary,
    colorPrimaryTextHover: "#183dc2",
    colorPrimaryTextActive: "#122f98",
    colorTextLightSolid: appTheme.primaryForeground,
    colorText: appTheme.foreground,
    colorBgContainer: appTheme.background,
    colorBorder: appTheme.border,
    colorBorderSecondary: appTheme.border,
    colorTextSecondary: appTheme.mutedForeground,
    colorTextPlaceholder: appTheme.mutedForeground,
    colorLink: appTheme.primary,
    colorLinkHover: "#183dc2",
    colorLinkActive: "#122f98",
    colorBgLayout: appTheme.muted,
    borderRadius: appTheme.radius,
    fontFamily: appTheme.fontFamily,
    fontSize: 14,
    controlHeight: 38,
    controlHeightLG: 44,
    controlOutlineWidth: 2,
    lineHeight: 1.6,
    motionDurationMid: "0.16s",
  },
  components: {
    Button: {
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
      paddingInline: 16,
    },
    Table: {
      headerBg: "#e5efff",
      headerColor: appTheme.mutedForeground,
      headerSplitColor: "transparent",
      rowHoverBg: "#eef7ff",
      cellPaddingBlock: 16,
      cellPaddingInline: 20,
      borderColor: appTheme.border,
    },
    Form: { labelColor: appTheme.foreground, itemMarginBottom: 22 },
    Modal: { titleFontSize: 18, titleLineHeight: 1.5, borderRadiusLG: 12 },
    Drawer: { footerPaddingBlock: 16, footerPaddingInline: 20 },
    Descriptions: { labelBg: "#e5efff", itemPaddingBottom: 16 },
    Alert: { borderRadiusLG: 8 },
    Tag: { borderRadiusSM: 4 },
    Pagination: { itemBg: appTheme.background },
  },
};
