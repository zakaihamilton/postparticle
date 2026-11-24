import {
  publicArticleMetadataIndexStatus,
  rebuildPublicArticleMetadataIndex,
} from "@/lib/article-metadata-index";
import { json } from "@/lib/http";
import { projectHandler } from "@/lib/manage-api";

export const GET = projectHandler(async (_request, { store }) =>
  json({
    publicArticleMetadataIndex: await publicArticleMetadataIndexStatus(store),
  }),
);

export const POST = projectHandler(async (_request, { store }) => {
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
}, true);
