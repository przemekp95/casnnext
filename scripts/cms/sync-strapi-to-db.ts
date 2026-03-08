import { AppDataSource } from "../../lib/db.shared";
import { syncAllCmsContent } from "../../lib/server/cms-sync";

async function run() {
  try {
    const summary = await syncAllCmsContent();
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (AppDataSource?.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error) => {
  console.error("Strapi -> DB sync failed:", error);
  process.exit(1);
});
