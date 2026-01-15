import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayNameToAuthor1736424470001 implements MigrationInterface {
  name = 'AddDisplayNameToAuthor1736424470001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop column if exists, then add it - truly destructive
    await queryRunner.query(`ALTER TABLE \`Author\` DROP COLUMN IF EXISTS \`displayName\``);

    await queryRunner.query(`
      ALTER TABLE \`Author\`
      ADD COLUMN \`displayName\` varchar(255) NOT NULL DEFAULT ''
    `);

    // Always update existing records
    await queryRunner.query(`
      UPDATE \`Author\`
      SET \`displayName\` = \`name\`
      WHERE \`displayName\` = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove displayName column from Author table
    await queryRunner.query(`ALTER TABLE \`Author\` DROP COLUMN \`displayName\``);
  }
}