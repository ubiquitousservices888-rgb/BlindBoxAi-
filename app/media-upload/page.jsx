import { notFound } from "next/navigation";

export const metadata = {
  title: "Not found | BlindBoxAI",
  robots: { index: false, follow: false },
};

export default function MediaUploadPage() {
  notFound();
}
