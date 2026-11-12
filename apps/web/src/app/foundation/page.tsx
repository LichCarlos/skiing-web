import { SiteNavigation } from "@/components/site-navigation";
import Link from "next/link";
import { StyleFoundation } from "@common/ui";
import { routes } from "@/config/routes";
import styles from "@/styles/page.module.css";
export default function FoundationPage() {
  return (
    <main className={styles.main}>
      <SiteNavigation />
      <div className={styles.panel}>
        <StyleFoundation />
      </div>
    </main>
  );
}
