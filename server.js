// import libraries
require("dotenv").config()
const express = require('express')
const app = express()
const methodOverride = require("method-override")
const path = require('path')
const multer = require('multer')
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'images')
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname))
    }
})
const upload = multer({storage: storage})

app.set('view engine', 'ejs')
app.use(methodOverride('_method'))

// handle get requests
app.get('/', (req, res) => {
    res.render('home')
})

app.get('/about', (req, res) => {
    res.render('about')
})

app.get('/contact', (req, res) => {
    res.render('contact')
})

app.get('/dashboard', (req, res) => {
    res.render('dashboard')
})

// handle post requests
app.post('/upload', upload.single("image"), (req, res) => {
    res.send('Image uploaded!!')
})

app.listen(5000)