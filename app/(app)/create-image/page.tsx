import { Suspense } from "react";
import { CreateImage } from "@/components/verse-image/create-image";
export default function Page() {
  return (
    <Suspense fallback={<p className="loading">Preparing your verse…</p>}>
      <CreateImage />
    </Suspense>
  );
}
