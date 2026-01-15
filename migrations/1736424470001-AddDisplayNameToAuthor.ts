import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayNameToAuthor1736424470001 implements MigrationInterface {
  name = 'AddDisplayNameToAuthor1736424470001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists and drop it first - compatible with older MySQL versions
    const columnExists = await queryRunner.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Author'
        AND COLUMN_NAME = 'displayName'
    `);

    if (columnExists.length > 0) {
      // Drop the existing column first
      await queryRunner.query(`ALTER TABLE \`Author\` DROP COLUMN \`displayName\``);
    }

    // Add the column
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