/** Вкладки карточки: switch по вкладке — не диспетчер экранов (совпал один раздел). */
export function Tabs(props: { readonly tab: string }) {
  switch (props.tab) {
    case 'users':
      return <UsersTab />;
    default:
      return null;
  }
}

function UsersTab() {
  void fetch('/api/admin/decoy');
  return <div />;
}
