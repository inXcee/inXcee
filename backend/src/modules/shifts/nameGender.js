// Türkçe isim → cinsiyet tahmini. Yatakhane cinsiyet-ayrımlı olduğu için
// istatistikler erkek/kadın diye bölünür; Excel'den gelen yeni personelde
// gender boş kalırsa stat'lar eksik sayar. Sözlük temelli — emin değilse null
// döner (yanlış tahmin yerine boş bırakmak güvenli).

import { foldName } from './import.js'

// Yaygın Türkçe erkek isimleri (folded anahtarla eşleşir).
const MALE = `
ahmet mehmet mustafa ali hasan huseyin ibrahim ismail osman yusuf omer murat emre burak serkan
kemal tarik ercan fikret guven orhan kadir selim bulent cengiz davut erdal faruk gokhan haluk
ilhan kamil levent metin nuri okan ramazan sinan tolga ugur volkan yilmaz zafer adem bahadir cem
deniz engin fatih haydar ismet kayhan necati onur arda serkan suleyman halil recep ferhat hakan
baris caner cihan ozkan oguz onat semih unsal kerem berkay bora can cagri efe ege erkan ertan
gurkan hamza huseyin ilker irfan kaan koray mert nedim nihat oktay rahmi resul savas selcuk
serhat taner timur turgut umut veli yakup yavuz zeki abdullah akin alperen anil aykut aziz bekir
cemal coskun dogan dursun emrah erdem ergun ersin furkan gencay hidayet ilyas kazim kursat
mahmut muhammed naim nazmi okyanus polat ramiz riza ruhi salih sami sefa sezai sait tamer
tayfun teoman tuncay vahit yasin yunus enes batuhan kuzey poyraz alp aras
emirhan mertcan mevlut umutcan ayhan selahattin turan oner aytac burhan ozan ufuk sezer
seyfettin musa eren melih saner ozay goktug yasar nazim sefer suat vedat rasim nurettin
ekrem ferdi gaffar hayrettin kemalettin lutfi mesut nizamettin sabri sadettin tahsin zekeriya
`.split(/\s+/).filter(Boolean)

// Yaygın Türkçe kadın isimleri.
const FEMALE = `
ayse fatma hatice zeynep emine elif zehra merve busra esra selin gulsen ozlem nurcan serap
hulya sibel melek asli ceren derya ebru filiz gamze hacer ilknur kadriye leman muge nese ozge
pinar reyhan sevgi tulay ulku vildan yasemin acelya bahar cansu dilek elvan feride gonul inci
kevser latife nazan selma melike esin arzu aygun aygul ayla ayten bedia bircan birsen ceyda
cigdem nurten sevim sevda sema seda saadet rabia rukiye ruya sare sila simge sueda tugba tugce
yagmur yildiz aysel aysun aynur banu basak begum belgin berna betul beyza burcu canan damla
demet didem dilara dudu duygu ece eda emel ezgi figen gizem gokce gul gulay gulcan gulden guler
gulhan gulnur gulseren guzin handan hande havva hilal huray irem kader kibar lale lerzan meltem
meryem mine mukaddes munevver nilgun nilufer nuray oya ozden perihan rahime saliha semra senay
sengul serpil sevil sevinc songul suna tuba turkan ummahan vesile yeliz zubeyde nazli sevgul
secil nesil sultan
dondu elnare funda gozde gulfer habibe hamide hayriye nalan necla neriman neslihan nurdan
nursen sevilay seyhan sumeyra sennur sifa yeter yonca gulsum mevlude nilay satiye seher yesim
rusan kubra nesrin nermin birgul fadime sinem nafiye zeliha suheyla umran aysenur gulderen
ferda goksu emis gulizar hediye huriye ilkay kismet kiymet medine muazzez nebahat
necmiye nezahat nuriye rahmiye remziye saadet sadiye semiha serife sevdiye sukran tenzile
ummugulsum yurdanur zarife zekiye zennur cemile done emine fatos gulben hava
`.split(/\s+/).filter(Boolean)

const GENDER_MAP = new Map()
for (const n of MALE) GENDER_MAP.set(n, 'male')
for (const n of FEMALE) GENDER_MAP.set(n, 'female')

// Tam ada bakıp ilk isimden cinsiyet tahmini. Bilinmiyorsa null.
export function guessGender(fullName) {
  const folded = foldName(fullName)
  if (!folded) return null
  for (const token of folded.split(' ')) {
    const g = GENDER_MAP.get(token)
    if (g) return g
  }
  return null
}
