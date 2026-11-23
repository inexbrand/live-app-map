/**
 * Лист «Входы»: под каким пользователем открываются живые экраны карты.
 * Профили приложений с автовходом появляются сами при загрузке карты.
 */
import { getKorborApiBase } from '../../lib/dogfood-api';
import { EdgeSheet } from '../EdgeSheet';
import { SessionProfilesPanel } from '../SessionProfilesPanel';
import type { DogfoodActorsState } from './use-dogfood-actors';

/** Props листа входов. */
export type LoginsSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly dogfood: DogfoodActorsState;
};

/**
 * Лист входов.
 *
 * @param props - открыт ли и пользователи ручного dev-входа
 */
export function LoginsSheet(props: LoginsSheetProps) {
  const { open, onClose, dogfood } = props;
  return (
    <EdgeSheet open={open} side="right" title="Входы" description="Приложения с автовходом сами выдают роли — экраны открываются уже под ними." onClose={onClose}>
      <SessionProfilesPanel actors={dogfood.actors} actorsError={dogfood.error} apiBase={getKorborApiBase()} />
    </EdgeSheet>
  );
}
