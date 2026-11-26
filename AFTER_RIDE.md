# Блок «После заезда»

Секция после процесса выдачи видео показывает три шага: отправка ролика, приглашение к честному публичному отзыву или прямой обратной связи, позднее приглашение на новый заезд только после отдельного согласия. Отзывы помогают новым гостям выбрать площадку. Кампании и рассылки описаны как отдельная опция по согласованию.

Переписка с трассой «Круг» вымышленная и подписана «Пример переписки». Сообщения и варианты ответа — обычный HTML, без обработчиков, ссылок на отзыв, форм, подписки, отправки или интеграции с WhatsApp. Единственный действующий CTA секции ведёт на существующий номер Александра. Вид и условия запуска будущего процесса обсуждаются отдельно.

## Иллюстрация

- Создана встроенным ImageGen; не фотография выполненного проекта.
- Файл: [assets/photo-after-ride.webp](assets/photo-after-ride.webp), 960 × 1200, 40 116 байт. Метаданные удалены, загрузка ленивая, размеры и alt заданы.
- Текст не встроен в изображение: HTML остаётся читаемым при масштабировании и доступен вспомогательным технологиям.
- Исходный PNG не включён в репозиторий.

Точный prompt ImageGen:

> Use case: photorealistic-natural. Asset type: original editorial photograph for the existing Russian B2B adventure-video website Montage 360, vertical 4:5 composition. Primary request: a realistic hand holding a black smartphone at an outdoor karting track after a ride, cinematic depth of field, quiet premium atmosphere. Scene: asphalt track curving away with soft olive woodland and subtle warm evening lights, blurred track barriers in the distance, no visible people or faces. Subject: a single anatomically natural adult hand holding a modern black phone near the lower right of the image; the phone screen is blank dark reflective glass, no UI, no text. Composition: the phone and hand occupy the lower right third, background track remains visible in the upper and left portions; useful calm negative space across the upper and middle area for a separate HTML conversation overlay. Style: convincing natural photograph, 50mm lens, warm late-afternoon light, detailed skin and glass, subdued deep olive, charcoal, cream and lime highlights compatible with a dark olive website. Constraints: no text, letters, numbers, logos, watermarks, notification symbols, identifiable faces, actual app screenshots, or advertising signage. This is an illustrative fictional scene, not a photograph of a completed client project.

## Проверки

- Chrome: 320 × 780, 390 × 844, 1440 × 1000, обычный вход на главную и прокрутка к секции. Все три шага, разделение моментов переписки и условие отдельного согласия присутствуют; горизонтального переполнения нет.
- Фото загружается, WebP 960 × 1200; loading="lazy", width/height и alt заданы. Подпись указывает пример переписки и ImageGen.
- Декоративные варианты ответа не являются фокусируемыми кнопками или ссылками. CTA фокусируется клавиатурой и имеет высоту не менее 44 px. Контраст новых текстовых пар от 5.4:1.
- В браузере нет JS/HTTP-ошибок или запросов отправки. Формы, сбор данных и сторонние ресурсы не добавлены.
- Все восемь видео повторно запущены на трёх ширинах: 24 воспроизведения, один плеер, ненулевой аудиосигнал, muted=false. MP4 до клика не загружаются.
- Бинарники видео, оригинальный звук, код плеера и все 26 ссылок с ?v=20261126-audio8 сохранены. Title, description, H1, canonical, sitemap, noindex страницы гостя, телефон и Telegram сохранены.
- node --check examples.js и git diff --check проходят.

Физические устройства iOS/Android и слуховая оценка аудио не проверялись. Существующие ролики не изменялись. Локальные скриншоты и скрипты проверки в output/ не публикуются; для отдельных снимков секции фиксированные элементы навигации скрыты только на время снимка.
