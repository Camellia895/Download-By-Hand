觉得手动下载x的图像很麻烦，网络上的脚本要不是就是需要付费，要不就是太过手工业。不悦。于是用gemini写了个脚本，还算好用（有问题尽管提便是，我知道代码的运行逻辑所以不至于不懂）。

在推文中添加“下载”按钮，下载PNG原图。在用户的'媒体'页面，增加“批量下载”按钮，可滚动收集页面所有图片后一键下载。

嫌弃下载频率太低可以调整这行代码 await new Promise(resolve => setTimeout(resolve, 1000))
当中的1000表示一千毫秒，可以往小得调100应该是可行的。数值太小偶尔会触发429

<img width="637" height="614" alt="image" src="https://github.com/user-attachments/assets/f3e997fd-94da-4e33-a590-54ec5284dd76" />

## 点击它 ##

<img width="620" height="500" alt="image" src="https://github.com/user-attachments/assets/de87ed4b-3f67-4acc-8552-55a951941132" />

## 往下滑随着下滑获取到图像的id，用于下载 ##

<img width="609" height="227" alt="image" src="https://github.com/user-attachments/assets/56dfd951-1976-41ba-91f9-c2f1714ea1c2" />

## 最后点击下载 ##

新增悬浮下载按钮和复制下载链接按钮（请善用中键进行转跳），在idm批量下载是可行的。
<img width="620" height="320" alt="image" src="https://github.com/user-attachments/assets/ce75520a-b84a-4c13-9e5b-c310369147f3" />

