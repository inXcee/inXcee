import { describe, expect, it } from 'vitest'
import { sahaPosterHtml } from './sahaPoster.js'

// Saha afişi: personel telefonuyla QR'ı okutup /saha'ya girer (spec §9). Afiş doğru adresi ve kodu taşımalı.
describe('sahaPosterHtml', () => {
  const doc = () => new DOMParser().parseFromString(
    sahaPosterHtml({ url: 'https://avskamp.com/saha', qrDataUrl: 'data:image/png;base64,QUJD' }), 'text/html')

  it('QR görseli ve yazılı adres afişte', () => {
    expect(doc().querySelector('img').getAttribute('src')).toBe('data:image/png;base64,QUJD')
    expect(doc().body.textContent).toContain('avskamp.com/saha')
  })

  it('kullanım üç adım', () => {
    expect(doc().querySelectorAll('ol > li')).toHaveLength(3)
  })

  it('adres HTML olarak kaçırılır', () => {
    const html = sahaPosterHtml({ url: 'https://x.test/saha?a=<b>', qrDataUrl: 'data:image/png;base64,QUJD' })
    expect(html).not.toContain('<b>')
  })
})
