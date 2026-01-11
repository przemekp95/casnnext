import { MigrationInterface, QueryRunner } from "typeorm";

export class FixAuthorsData1768119369984 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Fix existing author data by populating missing name, img, and bio fields
        // based on slug values and providing reasonable defaults

        // 1. Update names based on existing slugs (convert slug format to proper names)
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`name\` = CASE
                WHEN \`slug\` = 'lempicka-wyszynska' THEN 'Dominika Aempicka-WyszyDska'
                WHEN \`slug\` = 'balcerowski' THEN 'Dr Piotr Balcerowski'
                WHEN \`slug\` = 'kochman' THEN 'Adw. Oskar Kochman'
                WHEN \`slug\` = 'rosolowski' THEN 'Marcin RosoBowski'
                WHEN \`slug\` = 'luczuk' THEN 'Dr Piotr Auczuk'
                WHEN \`slug\` = 'domanska' THEN 'Dr Aldona DomaDska'
                WHEN \`slug\` = 'lewandowski' THEN 'Adw. dr Bartosz Lewandowski'
                WHEN \`slug\` = 'kochan' THEN 'Prof. Marek Kochan'
                WHEN \`slug\` = 'wos' THEN 'RafaB Wo['
                WHEN \`slug\` = 'gursztyn' THEN 'Piotr Gursztyn'
                WHEN \`slug\` = 'kita' THEN 'Kacper Kita'
                WHEN \`slug\` = 'swietlik' THEN 'Wiktor Zwietlik'
                WHEN \`slug\` = 'rutke' THEN 'Grzegorz Rutke'
                WHEN \`slug\` = 'bochenek' THEN 'Adrian Bochenek'
                WHEN \`slug\` = 'trochanowska' THEN 'Beata Trochanowska'
                WHEN \`slug\` = 'bruszewski' THEN 'MichaB Bruszewski'
                WHEN \`slug\` = 'giera' THEN 'Kamil Giera'
                WHEN \`slug\` = 'pietr' THEN 'Wojciech Pietr'
                WHEN \`slug\` = 'rak' THEN 'Dr Krzysztof Rak'
                WHEN \`slug\` = 'dakowski' THEN 'Marek Dakowski'
                WHEN \`slug\` = 'feszler' THEN 'Mateusz Feszler'
                WHEN \`slug\` = 'horoszko' THEN 'Aleksandra Horoszko'
                WHEN \`slug\` = 'trabinski' THEN 'Piotr TrbiDski'
                WHEN \`slug\` = 'okolowski' THEN 'Dr hab. PaweB OkoBowski'
                WHEN \`slug\` = 'ratynski' THEN 'Dr Mateusz RatyDski'
                WHEN \`slug\` = 'rowinski' THEN 'Tomasz RowiDski'
                WHEN \`slug\` = 'siemiatkowski' THEN 'dr Jakub Siemitkowski'
                WHEN \`slug\` = 'musial' THEN 'dr Adrian MusiaB'
                WHEN \`slug\` = 'gorka' THEN 'adw. Grzegorz Górka'
                WHEN \`slug\` = 'szymanski' THEN 'MichaB SzymaDski'
                WHEN \`slug\` = 'masior' THEN 'dr MichaB Masior'
                WHEN \`slug\` = 'pietrzak' THEN 'PrzemysBaw Pietrzak LL.M.'
                ELSE \`name\`
            END
            WHERE \`name\` IS NULL OR \`name\` = ''
        `);

        // 2. Update image paths (set default images based on slug)
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`img\` = CONCAT('/images/authors/', \`slug\`, '.jpg')
            WHERE \`img\` IS NULL
        `);

        // 3. Update bio fields with meaningful descriptions where available
        await queryRunner.query(`
            UPDATE \`Author\`
            SET \`bio\` = CASE
                WHEN \`slug\` = 'balcerowski' THEN 'Zawodowo zwizany z trzecim sektorem. Jego zainteresowania badawcze obejmuj przede wszystkim bezpieczeDstwo publiczne i ekonomiczne. Absolwent Instytutu Nauk Politycznych Uniwersytetu Warszawskiego oraz Kolegium Gospodarki Zwiatowej SGH.'
                WHEN \`slug\` = 'kochman' THEN 'Absolwent WydziaBu Prawa i Administracji Uniwersytetu Warszawskiego. Adwokat  czBonek Izby Adwokackiej w Warszawie. Autor analiz i publikacji prawnych i ekonomicznych.'
                WHEN \`slug\` = 'rosolowski' THEN 'Absolwent WydziaBu Prawa i Administracji Uniwersytetu Warszawskiego; w latach 2006-2008 zastpca dyrektora Biura Prasowego Kancelarii Prezydenta RP.'
                WHEN \`slug\` = 'luczuk' THEN 'Medioznawca; publicysta; ekspert ds. cyberbezpieczeDstwa. Adiunkt w Katedrze Internetu i Komunikacji Cyfrowej Instytutu Edukacji Medialnej i Dziennikarstwa UKSW.'
                WHEN \`slug\` = 'domanska' THEN 'Prezes Instytutu Staszica; adiunkt Instytutu Studiów Midzynarodowych SzkoBy GBównej Handlowej w Warszawie; doktor habilitowany nauk ekonomicznych.'
                WHEN \`slug\` = 'lewandowski' THEN 'Adwokat; doktor nauk prawnych; Dyrektor Centrum Interwencji Procesowej Ordo Iuris.'
                WHEN \`slug\` = 'kochan' THEN 'Jzykoznawca; medioznawca. Naukowo zajmuje si jzykiem komunikacji publicznej; wizerunkiem osób i instytucji.'
                WHEN \`slug\` = 'wos' THEN 'Dziennikarz i analityk ekonomiczny publikujcy m.in. w Salonie24 i Dzienniku Gazeta Prawna.'
                WHEN \`slug\` = 'gursztyn' THEN 'Dziennikarz; publicysta; historyk. PracowaB m.in. w Radiu Plus; Telewizji Puls; telewizji Polsat.'
                WHEN \`slug\` = 'kita' THEN 'Katolik; m|; analityk; publicysta. Obserwator polityki midzynarodowej i kultury.'
                ELSE 'Ekspert CASN specjalizujcy si w analizach politycznych, gospodarczych i spoBecznych.'
            END
            WHERE \`bio\` IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: This migration fixes existing data, so down() would need to be careful
        // For safety, we don't revert the data fixes - they improve data quality
    }

}