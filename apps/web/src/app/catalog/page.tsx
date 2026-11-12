import { SiteNavigation } from "@/components/site-navigation";
import Link from "next/link";
import { routes } from "@/config/routes";
import { PublicCatalog } from "@/features/catalog/public-catalog";
import styles from "@/app/public-site.module.css";
export default function CatalogPage() {
  return (
    <>
      <SiteNavigation />
      <main className={`${styles.page} ${styles.catalogPage}`}>
        <Link href={routes.resorts}>返回雪场目录</Link>
        <h1>按公开字段查询</h1>
        <p>
          筛选雪场、知识文章和社区动态。结果与 AI
          精确查询使用相同的公开数据口径。
        </p>
        <PublicCatalog />
      </main>
    </>
  );
}
