if (process.env.NODE_ENV !== "production") {
    require("dotenv").config()
}

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const mongoose = require("mongoose")
const User = require("./models/user")
const passport = require('passport')
const flash = require("express-flash")
const session = require("express-session")
const methodOverride = require("method-override")

const initializePassport = require("./passport-config")
initializePassport(passport, async (email) => {
    var user = await User.findOne({email: email})
    return user
}, async (id) => {
    var user = await User.findOne({_id: id})
    return user
})

app.set('view engine', 'ejs')
app.use(express.urlencoded({extended: false}))
app.use(flash())
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

mongoose.connect(process.env.DBURI, {
    useNewUrlParser: true, useUnifiedTopology: true
})

// handle get requests

app.get('/', (req, res) => {
    res.render('home')
})

app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard')
})

app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login')
})

app.get('/sign_up', checkNotAuthenticated, (req, res) => {
    res.render('sign_up')
})

// handle post requests

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
}))

app.post('/sign_up', checkNotAuthenticated, async (req, res) => {

    const salt = await bcrypt.genSalt()
    const hashedPassword = await bcrypt.hash(req.body.password, salt)
    
    const user = new User({
        email: req.body.email,
        password: hashedPassword
    })

    await user.save()
    res.redirect("/login")
})

// handle delete requests

app.delete('/logout', async (req, res) => {
    req.logout(() => {
        res.redirect('/login');
    });
})

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }

    res.redirect('/login') 
}

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard')
    }

    next()
}

app.listen(5000)