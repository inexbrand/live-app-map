/**
 * Экран по разделу пути, когда конфиг экранов — только данные (админка korbor):
 * компонент выбирает `switch (section) { case 'users': return <UsersPage />; … }`.
 */
import ts from 'typescript';

/** Ветка switch: литералы case и узел с её кодом. */
type CaseBranch = { readonly labels: readonly string[]; readonly body: ts.Node };

/** Есть JSX внутри узла. */
function hasJsx(n: ts.Node): boolean {
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
    return true;
  }
  return ts.forEachChild(n, hasJsx) === true;
}

/** Ветки switch: подряд идущие пустые case сливаются со следующей веткой. */
function branchesOf(sw: ts.SwitchStatement): CaseBranch[] {
  const out: CaseBranch[] = [];
  let pending: string[] = [];
  for (const clause of sw.caseBlock.clauses) {
    if (ts.isCaseClause(clause) && ts.isStringLiteralLike(clause.expression)) {
      pending.push(clause.expression.text);
    }
    if (clause.statements.length > 0) {
      if (pending.length > 0 && hasJsx(clause)) {
        out.push({ labels: pending, body: clause });
      }
      pending = [];
    }
  }
  return out;
}

/**
 * Индекс диспетчеров экранов: switch с JSX-ветками по строковым case.
 */
export class SectionDispatch {
  private readonly switches: readonly CaseBranch[][];

  /**
   * @param files - .tsx-файлы проекта
   */
  constructor(files: readonly ts.SourceFile[]) {
    const switches: CaseBranch[][] = [];
    for (const sf of files) {
      if (!sf.fileName.endsWith('.tsx')) {
        continue;
      }
      const visit = (n: ts.Node): void => {
        if (ts.isSwitchStatement(n)) {
          const branches = branchesOf(n);
          if (branches.length > 0) {
            switches.push(branches);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    this.switches = switches;
  }

  /**
   * Ветки, которые рендерят раздел. Диспетчер — switch, где совпали хотя бы два
   * раздела экранов этого конфига: одиночное совпадение (вкладки, статусы) не в счёт.
   *
   * @param section - раздел экрана (`users`)
   * @param sections - все разделы экранов конфига
   * @param inScope - файл в сервисе конфига
   * @returns узлы веток для обхода
   */
  roots(section: string, sections: ReadonlySet<string>, inScope: (file: string) => boolean): ts.Node[] {
    const out: ts.Node[] = [];
    for (const branches of this.switches) {
      const first = branches[0];
      if (first === undefined || !inScope(first.body.getSourceFile().fileName)) {
        continue;
      }
      const hits = new Set(branches.flatMap((b) => b.labels).filter((l) => sections.has(l)));
      if (hits.size < 2) {
        continue;
      }
      out.push(...branches.filter((b) => b.labels.includes(section)).map((b) => b.body));
    }
    return out;
  }
}
