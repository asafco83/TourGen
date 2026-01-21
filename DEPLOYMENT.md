# Deploying Product Tour Generator

Since this project consists entirely of static files (HTML, CSS, JavaScript), you can deploy it to any static web hosting service for free.

## Option 1: GitHub Pages (Recommended)

If your project is hosted on GitHub:

1.  Go to your repository **Settings**.
2.  Click on **Pages** in the left sidebar.
3.  Under **Build and deployment**, select **Source** as `Deploy from a branch`.
4.  Select your `main` (or `master`) branch and the `/ (root)` folder.
5.  Click **Save**.

Your site will be live at `https://<username>.github.io/<repository-name>/`.
navigate to `/bookmarklet/install.html` to see the installation page.

## Option 2: Netlify / Vercel (Drag & Drop)

1.  Create an account on [Netlify](https://www.netlify.com/) or [Vercel](https://vercel.com/).
2.  Drag and drop your `Product Tour Generator` folder onto their dashboard.
3.  They will automatically deploy the site and give you a URL (e.g., `https://my-tour-tool.netlify.app`).

-   `README.md` (optional)

## Option 3: InfinityFree (or any cPanel Hosting)

If you are using InfinityFree:

1.  Login to the **Client Area** and open the **Control Panel**.
2.  Open the **Online File Manager** (or connect via FileZilla with your FTP credentials).
3.  Navigate into the `htdocs` folder.
4.  Upload the contents of your project folder here. You should see:
    -   `htdocs/index.html`
    -   `htdocs/bookmarklet/` (directory)
    -   `htdocs/examples/` (optional directory)
5.  Your tool is now live! Visit your domain (e.g. `http://yoursite.free.nf`), and you will be redirected to the Install Page.

## Option 4: General Standard Web Hosting
-   `README.md` (optional)

## Important Note

The **Install Page** (`bookmarklet/install.html`) automatically detects the domain it is hosted on. Once deployed, simply visit that page on your live site, and the "Tour Editor" bookmarklet will be generated with the correct production URL.
