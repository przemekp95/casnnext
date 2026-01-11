import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDisplayNameToAuthor1768126678592 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add displayName column to Author table
        await queryRunner.query(`
            ALTER TABLE \`Author\`
            ADD COLUMN \`displayName\` varchar(255) NOT NULL
        `);

        // Populate displayName with existing name values
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`displayName\` = \`name\`
            WHERE \`displayName\` IS NULL OR \`displayName\` = ''
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove displayName column from Author table
        await queryRunner.query(`
            ALTER TABLE \`Author\`
            DROP COLUMN \`displayName\`
        `);
    }

}