require('dotenv').config()
const fs = require('fs');
const docx = require('docx');
const { parse } = require('csv-parse');
const postgres = require('postgres');
const AWS = require('aws-sdk');

const { AlignmentType, Document, Packer, Paragraph } = docx;

const s3 = new AWS.S3();

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET,
    region: process.env.AWS_REGION
})

const sql = postgres(process.env.DATABASE_URL);

let bookIdsToDownload = [];
let failedIds = [];

function removeSpaces(book_title) {

    book_title = book_title.replace(/[\W_]+/g," ");
    return book_title.replace(/ /g, '_');
}

function generateDocXFormat(str) {

    const doc = new Document({
        sections: [{
            properties: {},
            children:[
                new Paragraph({
                    text: str,
                    alignment: AlignmentType.CENTER
                })
            ]
        }]
    });

    return doc;
}

async function downloadBookFromS3(bookTitle, asset_id, type, index) {

    const params = {
        Bucket: process.env.AWS_BUCKET + '/' + asset_id,
        Key: type === 'pdf' ? 'book' : 'index.html'
    }

    const { Body } = await s3.getObject(params).promise();
    let fileName = removeSpaces(bookTitle) + (type === 'pdf' ? '.pdf' : '.docx');

    if (type !== 'pdf') {

        let htmlBody = Body.toString();
        htmlBody = htmlBody.replace(/<\/?[^>]+(>|$)/g, "");
        htmlBody = htmlBody.replace(/&nbsp;/g, '\n');

        Packer.toBuffer(generateDocXFormat(htmlBody)).then((buffer) => {
            fs.writeFileSync(__dirname + '/book_downloads/' + fileName, buffer);
        })
    } else {

        await fs.writeFile(__dirname + '/book_downloads/' + fileName, Body, function(err, result) {
            if (err) console.log('Folder book_downloads does not exist in the root directory');
        });
    }
    
    console.log('Done downloading from S3 --- ' + (+index + 1) + ' of ' + bookIdsToDownload.length);
}

function findBookId(bookPath) {

    let split = bookPath.split('/');
    return split[5];
}

async function getAWSBookData() {

    for (i = 0; i < bookIdsToDownload.length; i++) {

        let bookId = bookIdsToDownload[i];
        let bookData = await getBookDataById(bookId);

        try {
            await downloadBookFromS3(bookData.title, bookData.asset_id, bookData.type, i);
        } catch (excpt) {

            failedIds.push(bookIdsToDownload[i]);
        }
    }

    console.log('Finished all downloads.');
    if (failedIds.length !== 0) {
        console.log('Partial Failure, please check the following ids: ');
        console.log(failedIds);
    }
}

async function getBookDataById(bookId) {
    const book = await sql`
        select
            asset_id,
            title,
            type
        from book
        where id = ${ bookId }
    `

    return book[0];
}



fs.createReadStream('./bookstodownload.csv')
    .pipe(parse({ delimiter: ',', fromLine: 2 }))
    .on('data', function(row) {
        // column 1 and 6 have book ids in them
        if (row[1]?.length > 0) {
            bookIdsToDownload.push(findBookId(row[1]))
        }

        if (row[6]?.length > 0) {
            bookIdsToDownload.push(findBookId(row[6]))
        }
    })
    .on('error', function() {
        console.log('Failed to read in the csv.');
    })
    .on('end', async function() {
        console.log('Completed read in of CSV file.');
        await getAWSBookData();
    })