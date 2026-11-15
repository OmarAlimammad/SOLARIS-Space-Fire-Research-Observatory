# SOLARIS Data Atlas v2 — Scientific Intelligence Dashboard

Bu patch mövcud işlək SOLARIS Research Platform v1 üçün hazırlanıb. Yeni Data Atlas tam 129 original BASS-II qeydini mövcud `/api/experiments?limit=500` API-dən yükləyir; backend faylları və NASA CSV-si dəyişmir.

## Quraşdırma

1. Bu qovluğu (`SOLARIS_Dashboard_Patch_v1`) Windows-da `SOLARIS_Research_Platform_v1` qovluğunun daxilinə köçür.
2. VS Code terminalını əsas layihə qovluğunda aç.
3. `python .\SOLARIS_Dashboard_Patch_v1\apply_dashboard.py`
4. `cd frontend`
5. `npm.cmd run build`
6. Frontend və backend serverləri işləyirsə `http://localhost:5173/#/explore` aç və `Ctrl+Shift+R` bas.

Əgər `npm.cmd run build` uğurlu olarsa, əlavə paket lazım deyil. Əgər port `5174`-dürsə, onunla aç.

## Yeni funksiyalar

- 129 BASS-II qeydi əsasında canlı metadata icmalı
- 3 interaktiv qrafik rejimi: material adları, ilkin O₂ bölgüsü (2 faiz-bəndlik bin), test illəri
- 7 seçilmiş sahə üzrə sənədləşmə səviyyəsi (risk balı DEYİL)
- ID/material/sample axtarışı, material, il, oksigen intervalı, məlumat keyfiyyəti filtrləri
- `Table` / `Cards` görünüşləri; uyğun qeydlər üzrə CSV ixracı; iki test seçib Compatibility Engine-ə göndərmək
- Qeyd seçilən kimi sağda source inspector; mənbə, xam cihaz göstəriciləri, naməlum sahələr
- Cihaz ekran göstəriciləri `cm/s` çevrilmir; alov yayılma sürəti və təhlükə ehtimalı uydurulmur

## Elmi məhdudiyyətlər

- Qrafiklər **yalnız BASS-II cədvəli** üzrədir. Material qrupları mətnin içində açıq yazılan etiketlərdən çıxarılır, naməlum rodların materialı təxmin edilmir.
- `Coverage 7/7` yalnız 7 seçilmiş metadata sahəsinin doluluğudur; elmi nəticənin etibarlılıq faizi deyil.
- O₂ statistikasında düzgün fiziki faiz intervalına düşməyən və boş göstəricilər excluded edilir. O₂-nin ilkin və son dəyərlərinin fərqi alov yayılma sürəti deyil.
- `Air display`, `Fan display`, `Flow restrictor` kalibrlənmiş hava sürəti deyil.
- BASS-II bir neçə böyük NASA yanma araşdırmasından yalnız biridir. Bu dashboard bütün NASA tədqiqatlarının təmsilçisi kimi göstərilməməlidir.
- CSV faylı API vasitəsilə yüklənir: hazırkı limit 500 qaydadır; dataset 500-ü keçsə, yanlış qismən statistikalar göstərilməyəcək.

## Testlər

- `cd frontend; node --test tests/data-atlas.test.mjs`
- Köhnə backend testləri: `python -m pytest -q`

## Təsir etdiyi fayllar

- Əvəz: `frontend/src/pages/Explore.jsx`
- Əlavə: `frontend/src/features/data-atlas/analysis.js`
- Əlavə: `frontend/src/features/data-atlas/dashboard.css`
- Əlavə: `frontend/tests/data-atlas.test.mjs`
- Kiçik dəyişiklik: `frontend/src/features/compatibility/CompatibilityWorkspace.jsx` yalnız Data Atlas-dan ötürülən test ID-lərinin əvvəlcədən seçilməsi üçün.

Backup `SOLARIS_BACKUP_DASHBOARD_...` adlı yeni qovluqda avtomatik yaradılır.
