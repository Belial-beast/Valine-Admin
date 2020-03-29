'use strict'
const nodemailer = require('nodemailer')
const ejs = require('ejs')
const fs = require('fs')
const path = require('path')
const request = require('request')

const config = {
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}

if (process.env.SMTP_SERVICE != null) {
  config.service = process.env.SMTP_SERVICE
} else {
  config.host = process.env.SMTP_HOST
  config.port = parseInt(process.env.SMTP_PORT)
  config.secure = process.env.SMTP_SECURE !== 'false'
}

const transporter = nodemailer.createTransport(config)
const templateName = process.env.TEMPLATE_NAME ? process.env.TEMPLATE_NAME : 'default'
const noticeTemplate = ejs.compile(fs.readFileSync(path.resolve(process.cwd(), 'template', templateName, 'notice.ejs'), 'utf8'))
const sendTemplate = ejs.compile(fs.readFileSync(path.resolve(process.cwd(), 'template', templateName, 'send.ejs'), 'utf8'))

// 提醒站长
exports.notice = (comment) => {
  // 站长自己发的评论不需要通知
  if (comment.get('mail') === process.env.TO_EMAIL ||
        comment.get('mail') === process.env.SMTP_USER) {
    return
  }

  const name = comment.get('nick')
  const text = comment.get('comment')
  const url = process.env.SITE_URL + comment.get('url')

  const emailSubject = '👉 咚！「' + process.env.SITE_NAME + '」上有新评论了'
  const emailContent = noticeTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    name: name,
    text: text,
    url: url + '#post-comment'
  })

  const mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + '>',
    to: process.env.TO_EMAIL ? process.env.TO_EMAIL : process.env.SMTP_USER,
    subject: emailSubject,
    html: emailContent
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error)
    }
    comment.set('isNotified', true)
    comment.save()
    console.log('收到一条评论, 已邮件提醒站长')
  })

  const scContent = `
#### ${name} 发表评论：${text}


#### [\[查看评论\]](${url + '#post-comment'})`
  if (process.env.SERVER_KEY != null) {
    request.post({
      url: `https://sc.ftqq.com/${process.env.SERVER_KEY}.send`,
      form: {
        text: emailSubject,
        desp: scContent
      }
    }, function (error, response, body) {
      if (error) {
        console.log(error)
        return
      }
      if (response.statusCode === 200 && JSON.parse(body).errmsg === 'success') console.log('已微信提醒站长')
      else console.log(body)
    })
  }
}

// 发送邮件通知他人
exports.send = (currentComment, parentComment) => {
  // 站长被 @ 不需要提醒
  if (parentComment.get('mail') === process.env.TO_EMAIL ||
        parentComment.get('mail') === process.env.SMTP_USER) {
    return
  }
  const emailSubject = '👉 叮咚！「' + process.env.SITE_NAME + '」上有人@了你'
  const emailContent = sendTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    pname: parentComment.get('nick'),
    ptext: parentComment.get('comment'),
    name: currentComment.get('nick'),
    text: currentComment.get('comment'),
    url: process.env.SITE_URL + currentComment.get('url') + '#' + currentComment.get('pid')
  })
  const mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + '>',
    to: parentComment.get('mail'),
    subject: emailSubject,
    html: emailContent
  }

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error)
    }
    currentComment.set('isNotified', true)
    currentComment.save()
    console.log(currentComment.get('nick') + ' @了' + parentComment.get('nick') + ', 已通知.')
  })
}

// 该方法可验证 SMTP 是否配置正确
exports.verify = function () {
  console.log('....')
  transporter.verify(function (error, success) {
    if (error) {
      console.log(error)
    }
    console.log('Server is ready to take our messages')
  })
}
