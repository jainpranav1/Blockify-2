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

app.get('/', get_auth, (req, res) => {

    res.render('home', {is_auth: res.locals.is_auth})
})

app.get('/dashboard', redirect_not_auth, (req, res) => {
    res.render('dashboard', {is_auth: true})
})

app.get('/login', redirect_auth, (req, res) => {
    res.render('login', {is_auth: false})
})

app.get('/sign_up', redirect_auth, (req, res) => {
    res.render('sign_up', {is_auth: false})
})

// handle post requests

app.post('/login', passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
}))

app.post('/sign_up', async (req, res) => {

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

// add is_auth attribute to res.locals
function get_auth(req, res, next) {
    if (req.isAuthenticated()) {
        res.locals.is_auth = true
        return next()
    }

    res.locals.is_auth = false
    return next()
}

// redirect to dashboard if authenticated
function redirect_auth(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard', {is_auth: true})
    }

    return next()
}

// redirect to login if not authenticated
function redirect_not_auth(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }

    return res.redirect('/login', {is_auth: false})
}

app.listen(5000)