# SOLARIS — Compatibility Engine + Evidence Passport (v1)

Bu paket SOLARIS_Research_Platform_v1 layihəsinə ilk REAL mənbə-məlumat müqayisəsi əlavə edir.

## Yeni funksiyalar
- Research Studio → Experiment Compatibility işləyir.
- NASA BASS-II cədvəlindən 2 fərqli test seçmək olur (məsələn B1 və B2).
- Sistem materialın açıq adı, mətnlə göstərilən qalınlıq, ilkin O₂ və xam aparat göstəricilərini müqayisə edir.
- 'Source match', 'Source difference', 'Unknown' statusları qaytarır.
- Sağ tərəfdə / aşağıda Evidence Passport: original NASA mənbələri, metod və məhdudiyyətlər.
- Başqa 6 Research Studio aləti IN DEVELOPMENT olaraq qalır.
- Əvvəlki Home v2.1, Explore, NASA CSV və Discover dəyişmir.

## Quraşdırma — Windows, VS Code, PowerShell

1. Əvvəl **bütün layihənin ayrıca ehtiyat nüsxəsini saxla**.
2. ZIP-i Extract All et. İçində `SOLARIS_Compatibility_Patch_v1` qovluğu görünəcək.
3. VS Code terminalında hazırkı `SOLARIS_Research_Platform_v1` qovluğuna keç.
4. Skripti bu layihə qovluğundan işlə:

```powershell
python "C:\Users\ASUS\Downloads\SOLARIS_Compatibility_Patch_v1\apply_patch.py"
```

Buradakı Downloads yolunu faylın həqiqətən yerləşdiyi yerə uyğun dəyiş.
İstəsən `SOLARIS_Compatibility_Patch_v1` qovluğunu birbaşa layihənin içinə köçür və sadəcə:

```powershell
python .\SOLARIS_Compatibility_Patch_v1\apply_patch.py
```

**Skript hazır dəyişdirilmiş faylların öz ehtiyat nüsxəsini əlavə olaraq yaradır.**

## Başlat

Frontend terminalı (işləyirsə olduğu kimi qala bilər):
```powershell
cd frontend
npm.cmd run dev
```
Backend terminalı (əvvəlki uvicorn serverini Ctrl+C ilə dayandır, sonra yenidən başlat):
```powershell
cd backend
python -m uvicorn main:app --reload --port 8000
```

Brauzerdə:
- http://localhost:5173/#/research
- http://localhost:8000/docs (POST /api/compatibility)

## Nəyi yoxlamalı?
1. Research Studio səhifəsində iki seçmə menyusu görünür.
2. B1 və B2 seçib **Compare recorded conditions** bas.
3. PMMA materialının açıq adı uyğun, filmin qalınlığı 100 və 200 µm olaraq fərqli görünməlidir.
4. Initial oxygen hər iki testdə 22.2% görünməlidir.
5. Air display və Fan display heç vaxt fiziki cm/s sürət kimi göstərilməməlidir.
6. Evidence Passport-da NASA mənbəsi və elmi məhdudiyyətlər görünməlidir.
7. Digər 6 elmi alət hələ 'IN DEVELOPMENT' olmalıdır.

## Testlər

Layihənin əsas qovluğundan:
```powershell
python -m pip install pytest httpx
python -m pytest -q tests
```

**Müəyyən edilmiş mühitdə 8 Python testi keçib.** Buradakı frontend build-i npm paketləri yerli mühitdə olmadığından avtomatik yoxlamaq mümkün olmadı; öz kompüterində bunu işlə:
```powershell
cd frontend
npm.cmd run build
```

## Elmi dürüstlük
Bu, müşahidə şəraitlərinin **deskriptiv müqayisəsidir**. Nə yanma modelidir, nə yanğın riski proqnozu, nə də NASA tərəfindən validasiya edilmiş eksperiment uyğunluğu sertifikatıdır. BASS-II orijinal cədvəlində təsdiqli airflow cm/s və flame-spread rate yoxdur. Bəzi material ölçüləri mətn sahəsindən çıxarılır və source verification tələb edir.

## Dəyişən fayllar
- backend/main.py (yalnız additive alanlar + /api/compatibility + CORS POST)
- backend/scientific/__init__.py (new)
- backend/scientific/compatibility.py (new)
- frontend/src/lib/api.js (+ compareExperiments)
- frontend/src/pages/Research.jsx (Compatibility Workspace)
- frontend/src/features/compatibility/CompatibilityWorkspace.jsx (new)
- frontend/src/features/compatibility/compatibility.css (new)
- tests/test_compatibility.py (new)

`Home.jsx`, `home.css`, `Explore.jsx`, original NASA CSV untouched.
