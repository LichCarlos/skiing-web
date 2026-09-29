import Link from "next/link";
import { StyleFoundation } from "@common/ui";
import { routes } from "@/config/routes";
import styles from "@/styles/page.module.css";
export default function FoundationPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link className={styles.link} href={routes.home}>
          返回首页
        </Link>
        <h1 className={styles.title}>基础样式与路由预览</h1>
        <p className={styles.copy}>
          当前应用：web。此页验证全局样式、当前端主题覆盖与独立路由名称。
        </p>
      </header>
      <div className={styles.panel}>
        <StyleFoundation />
      </div>
    </main>
  );
}
