Quick node_js app to download books from the BookNook DB and convert them into .docx if they are html or download them as .pdf of they are stored as such.

1) Make sure to create a folder in the root directory called 'book_downloads'
2) Create a file inside the root directory of books to be imported. Columns 2 and 7 are scanned for a url containing the bookId within it
2) Create and configure an .env file based on the .env_example
3) Run node main.js 