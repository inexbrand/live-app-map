/**
 * Разбор schema.prisma: модели и enum, @@map, ключи поля и составные @@id, связи
 * с onDelete, списки и необязательные поля, `///`-описания.
 */
import { expect, test } from 'bun:test';
import { parsePrismaSchema } from './tables-prisma';

const SCHEMA = `/// Пользователь
model User {
  /// Ключ
  id    Int      @id @default(autoincrement())
  email String   @unique @map("email_address")
  role  Role     @default(USER)
  tags  String[]
  bio   String?
  // служебная строка
  posts Post[]
  @@map("users")
}

model Post {
  id       Int    @default(autoincrement())
  authorId Int
  slug     String
  editorId Int?
  author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
  editor   User?  @relation("edits", fields: [editorId], references: [id])
  @@id([id, slug])
}

enum Role {
  USER
  ADMIN
  // комментарий
}
`;

test('модели как таблицы: колонки, ключи, ссылки, enum; поля-связи — не колонки', () => {
  expect(parsePrismaSchema(SCHEMA, 'schema.prisma')).toEqual([
    {
      orm: 'prisma',
      name: 'users',
      exportName: 'User',
      location: {
        file: 'schema.prisma',
        line: 2
      },
      columns: [
        {
          name: 'id',
          type: 'Int',
          primaryKey: true,
          notNull: true,
          default: 'autoincrement()',
          doc: 'Ключ'
        },
        {
          name: 'email',
          sqlName: 'email_address',
          type: 'String',
          notNull: true,
          unique: true
        },
        {
          name: 'role',
          type: 'Role',
          notNull: true,
          default: 'USER',
          enumValues: [
            'USER',
            'ADMIN'
          ]
        },
        {
          name: 'tags',
          type: 'String[]',
          notNull: true
        },
        {
          name: 'bio',
          type: 'String'
        }
      ],
      doc: 'Пользователь'
    },
    {
      orm: 'prisma',
      name: 'Post',
      exportName: 'Post',
      location: {
        file: 'schema.prisma',
        line: 14
      },
      columns: [
        {
          name: 'id',
          type: 'Int',
          notNull: true,
          default: 'autoincrement()',
          primaryKey: true
        },
        {
          name: 'authorId',
          type: 'Int',
          notNull: true,
          references: {
            table: 'User',
            column: 'id',
            onDelete: 'Cascade'
          }
        },
        {
          name: 'slug',
          type: 'String',
          notNull: true,
          primaryKey: true
        },
        {
          name: 'editorId',
          type: 'Int',
          references: {
            table: 'User',
            column: 'id'
          }
        }
      ]
    }
  ]);
});

test('модель без полей и пустая схема', () => {
  expect(parsePrismaSchema('model Empty {\n}\n', 's.prisma').map((t) => [t.name, t.columns.length])).toEqual([['Empty', 0]]);
  expect(parsePrismaSchema('', 's.prisma')).toEqual([]);
});
