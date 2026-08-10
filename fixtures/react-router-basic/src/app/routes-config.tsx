/**
 * Fixture: miniapp-like routes-config (tabRoute + path + Navigate).
 * Не исполняется — только static source для scanner-react-router.
 */

export function tabRoute(id: string, path: string) {
  return { id, path };
}

export const routes = [
  tabRoute('feed', 'feed'),
  tabRoute('wallet', 'wallet'),
  tabRoute('chats', 'chats'),
  { path: 'vacancies/:id' },
  { path: 'applications/:id/submit' },
  { path: 'employer/create' },
  { path: 'employer/vacancies' },
  { path: 'docs/*code' },
  { path: 'settings/:step?' },
];

export function ShellNav() {
  return (
    <>
      {/* scanner читает to= литералы */}
      <a data-nav to="/feed">
        Feed
      </a>
      <a data-nav to="/wallet">
        Wallet
      </a>
    </>
  );
}
