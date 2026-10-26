import { PRIVATE_PAGE_METADATA } from '../../lib/site-seo';

export const metadata = PRIVATE_PAGE_METADATA;

export default function AppLinksLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
