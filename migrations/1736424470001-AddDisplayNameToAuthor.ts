import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayNameToAuthor1736424470001 implements MigrationInterface {
  name = 'AddDisplayNameToAuthor1736424470001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if displayName column already exists
    const columnExists = await queryRunner.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Author'
        AND COLUMN_NAME = 'displayName'
    `);

    if (columnExists.length === 0) {
      // Add displayName column to Author table
      await queryRunner.query(`
        ALTER TABLE \`Author\`
        ADD COLUMN \`displayName\` varchar(255) NOT NULL DEFAULT ''
      `);

      // Update existing records to set displayName = name
      await queryRunner.query(`
        UPDATE \`Author\`
        SET \`displayName\` = \`name\`
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove displayName column from Author table
    await queryRunner.query(`ALTER TABLE \`Author\` DROP COLUMN \`displayName\``);
  }
}