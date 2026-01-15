import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayNameToAuthor1736424470001 implements MigrationInterface {
  name = 'AddDisplayNameToAuthor1736424470001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use ALTER TABLE with IF NOT EXISTS syntax (MySQL 8.0+)
    try {
      await queryRunner.query(`
        ALTER TABLE \`Author\`
        ADD COLUMN IF NOT EXISTS \`displayName\` varchar(255) NOT NULL DEFAULT ''
      `);

      // Update existing records to set displayName = name where it's empty
      await queryRunner.query(`
        UPDATE \`Author\`
        SET \`displayName\` = \`name\`
        WHERE \`displayName\` = ''
      `);
    } catch (error) {
      // If IF NOT EXISTS is not supported, fall back to checking manually
      const columnExists = await queryRunner.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Author'
          AND COLUMN_NAME = 'displayName'
      `);

      if (columnExists.length === 0) {
        await queryRunner.query(`
          ALTER TABLE \`Author\`
          ADD COLUMN \`displayName\` varchar(255) NOT NULL DEFAULT ''
        `);

        await queryRunner.query(`
          UPDATE \`Author\`
          SET \`displayName\` = \`name\`
          WHERE \`displayName\` = ''
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove displayName column from Author table
    await queryRunner.query(`ALTER TABLE \`Author\` DROP COLUMN \`displayName\``);
  }
}
