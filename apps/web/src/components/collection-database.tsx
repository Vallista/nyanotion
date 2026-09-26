"use client";

import { InlineDatabase, PortsProvider } from "@nyanotion/editor";
import { useEditorPorts } from "./document-editor";

/**
 * 모음 페이지의 데이터베이스. 본문에 끼운 것과 **같은 컴포넌트**를 쓴다 —
 * 두 벌을 두면 한쪽만 고치는 일이 반드시 생긴다. 표·보드·달력 전환도 그대로 따라온다.
 */
export function CollectionDatabase({
  collectionId,
  editable,
}: {
  collectionId: string;
  editable: boolean;
}) {
  const ports = useEditorPorts();

  return (
    <PortsProvider ports={ports}>
      <InlineDatabase collectionId={collectionId} editable={editable} framed={false} />
    </PortsProvider>
  );
}
