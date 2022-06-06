// import libraries
require("dotenv").config()

const express = require('express')
const app = express()

const path = require('path')
const fs = require('fs')
const fspromises = require('fs').promises
const vision = require('@google-cloud/vision').v1
const client = new vision.ImageAnnotatorClient()
const pdf = require('pdf-page-counter')

const multer = require('multer')
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'images')
    },
    filename: (req, file, cb) => {
        req.body.extension = path.extname(file.originalname);
        req.body.multer_name = Date.now();
        cb(null, req.body.multer_name + req.body.extension)
    }
})
const upload = multer({storage: storage})

const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database("./database.db", sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        return console.log(err.message)
    }
})

app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/images', express.static('images'));
app.use('/blocks', express.static('blocks'));

// create images table
sql = 'CREATE TABLE IF NOT EXISTS images(id INTEGER PRIMARY KEY,image_name,description,multer_name,extension)'
db.run(sql)

// get bounding boxes
async function get_bboxes_pdf(multer_name, extension, pages) {
    
    const inputConfig = {
        mimeType: 'application/pdf',
        content: await fspromises.readFile(`./images/${multer_name + extension}`)
    };

    const features = [{type: 'DOCUMENT_TEXT_DETECTION'}];

    const fileRequest = {
        inputConfig: inputConfig,
        features: features,
        pages: pages
    };

    const request = {
        requests: [fileRequest],
    };
    
    const [result] = await client.batchAnnotateFiles(request);

    const responses = result.responses[0].responses;

    bboxes = []
    for (const response of responses) {
      for (const page of response.fullTextAnnotation.pages) {

        bboxes.push([])
        for (const block of page.blocks) {
          for (const paragraph of block.paragraphs) {
            for (const word of paragraph.words) {

              bboxes.at(-1).push(word.boundingBox.normalizedVertices)
            }
          }
        }
      }
    }

    return bboxes
}

async function get_all_bboxes_pdf(multer_name, extension) {

    if (fs.existsSync(`./blocks/${multer_name}.json`)) {
        return
    }

    let dataBuffer = fs.readFileSync(`./images/${multer_name + extension}`)
    let data = await pdf(dataBuffer)
    let num_pages = data.numpages

    let bboxes = {}
    let i = 1
    while (i+4 <= num_pages) {
        
        let five_bboxes = await get_bboxes_pdf(multer_name, extension, [i, i+1, i+2, i+3, i+4])
        
        for (let j = 0; j < 5; ++j) {
            bboxes["page_" + (i + j)] = five_bboxes[j]
        }
        
        i = i+5
    }
    if (i <= num_pages) {

        let num_pages_left = num_pages - i + 1

        let pages = []
        for (let j = i; j <= num_pages; ++j) {
            pages.push(j)
        }
        
        let few_bboxes = await get_bboxes_pdf(multer_name, extension, pages)
        
        for (let j = 0; j < num_pages_left; ++j) {
            bboxes["page_" + (i + j)] = few_bboxes[j]
        }    
    }

    fs.writeFileSync(`./blocks/${multer_name}.json`, JSON.stringify(bboxes))
}

async function get_all_bboxes_other(multer_name, extension) {

    if (fs.existsSync(`./blocks/${multer_name}.json`)) {
        return
    }

    let bboxes = []
    const [result] = await client.textDetection(`./images/${multer_name + extension}`)
    const detections = result.textAnnotations
    detections.forEach(text => bboxes.push(text['boundingPoly']['vertices']))
    bboxes.shift()

    fs.writeFileSync(`./blocks/${multer_name}.json`, JSON.stringify(bboxes))
}

// handle get requests
app.get('/', (req, res) => {
    res.render('home')
})

app.get('/images', (req, res) => {
    sql = "SELECT * FROM images"
    db.all(sql, [req.params.id], function (err, rows) {
        if (err) {
            return console.log(err.message)
        }
        res.render('images/images', {images: rows.reverse()})
    })  
})

app.get('/images/new', (req, res) => {
    res.render('images/new')
})

app.get('/images/show/:id', (req, res) => {
    sql = "SELECT * FROM images WHERE id=?"
    db.get(sql, [req.params.id], async function (err, row) {
        if (err) {
            return console.log(err.message)
        }
        
        if (row.extension == ".pdf" || row.extension == ".PDF") {
            await get_all_bboxes_pdf(row.multer_name, row.extension)
            let bboxes = fs.readFileSync(`./blocks/${row.multer_name}.json`, {encoding:'utf8', flag:'r'})
            res.render('images/show_pdf', {image: row, bboxes: bboxes})
        }
        else {
            await get_all_bboxes_other(row.multer_name, row.extension)
            let bboxes = fs.readFileSync(`./blocks/${row.multer_name}.json`, {encoding:'utf8', flag:'r'})
            res.render('images/show_other', {image: row, bboxes: bboxes})
        }
    })  
})

app.get('/images/edit/:id', (req, res) => {
    sql = "SELECT * FROM images WHERE id=?"
    db.get(sql, [req.params.id], function (err, row) {
        if (err) {
            return console.log(err.message)
        }
        res.render('images/edit', {image: row})
    })  
})

// handle post requests
app.post('/images/new', upload.single("image"), (req, res) => {
    sql = 'INSERT INTO images(image_name, description, multer_name, extension) VALUES (?,?,?,?)'
    db.run(sql, [req.body.image_name, req.body.description, req.body.multer_name, req.body.extension], function (err) {
        if (err) {
            return console.log(err.message)
        }
        res.redirect(`/images/show/${this.lastID}`)
    })    
})

app.post('/images/edit/:id', (req, res) => {
    sql = 'UPDATE images SET image_name=?,description=? WHERE id=?'
    db.run(sql, [req.body.image_name, req.body.description, req.params.id], function (err) {
        if (err) {
            return console.log(err.message)
        }
        res.redirect(`/images/show/${req.params.id}`)
    })
})

app.post('/images/delete/:id', (req, res) => {
    sql = "SELECT * FROM images WHERE id=?"
    db.get(sql, [req.params.id], function (err, row) {
        if (err) {
            return console.log(err.message)
        }
        sql = 'DELETE FROM images WHERE id=?'
        db.run(sql, [req.params.id], function (err) {
            if (err) {
                return console.log(err.message)
            }
            fs.unlinkSync(`./images/${row.multer_name + row.extension}`)
            fs.unlinkSync(`./blocks/${row.multer_name}.json`)
            res.redirect('/images')
        }) 
    })    
})

app.listen(5000)