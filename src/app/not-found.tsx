import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-full place-items-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">没有找到这个页面</h1>
        <Link href="/" className="btn btn-primary mt-5">
          回工作台
        </Link>
      </div>
    </main>
  );
}
