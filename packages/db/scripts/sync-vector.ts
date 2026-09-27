/**
 * pgvector 가 켜져 있으면 벡터 칼럼·색인을 맞춘다. 없으면 아무것도 하지 않는다.
 * `db:migrate` 뒤에 자동으로 돌고, 확장을 나중에 켰을 때는 이것만 다시 돌리면 된다.
 */
import { loadEnv, syncVectorColumn } from "../src/index";

loadEnv();

const result = await syncVectorColumn();
if (!result.extension) {
  console.log("pgvector 가 꺼져 있습니다 — real[] 로 돕니다 (느리지만 정확합니다).");
  console.log("켜려면:  pwsh scripts/enable-vector.ps1");
} else {
  console.log(
    `pgvector 켜짐 — embedding_v 칼럼·HNSW 색인 확인${
      result.backfilled > 0 ? `, 옛 임베딩 ${result.backfilled}개 옮김` : ""
    }`,
  );
}
process.exit(0);
