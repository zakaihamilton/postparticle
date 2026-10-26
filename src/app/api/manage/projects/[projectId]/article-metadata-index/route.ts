import { manageHandler, manageProject } from "@/lib/manage-api";
import {
  publicArticleMetadataIndexStatus,
  rebuildPublicArticleMetadataIndex,
} from "@/lib/article-metadata-index";
import { json } from "@/lib/http";

type Context = { params: Promise<{ projectId: string }> };

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    const { projectId } = await context.params;
    const { store } = await manageProject(request, projectId, true);
    const result = await rebuildPublicArticleMetadataIndex(store);
    const publicArticleMetadataIndex =
      await publicArticleMetadataIndexStatus(store);
    if (!publicArticleMetadataIndex.ready)
      throw new Error("Public article metadata index was not committed");
    return json({
      publicArticleMetadataIndex,
      pageShards: result.pageShards,
      retries: result.retries,
    });
  },
);
